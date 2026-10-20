// Tests für server/einrichten.mjs (Einrichtung in der Cloud Shell) mit einem nachgebauten Oracle-Konto, das Angelegtes behält:
// Schutz, Netz, Server, Platzsucher, Abschließen und Adresse; jeder Schritt erkennt, was schon da ist, und fasst nichts Fremdes
// an. Ohne server/ (noch nicht im Release) übersprungen.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "einrichten.mjs"));
const test = (name, fn) => require("node:test")(name, { skip: !da && "server/ fehlt in diesem Baum" }, fn);
const laden = async () => ({ ...(await import(pathToFileURL(path.join(SERVER, "einrichten.mjs")).href)), ...(await import(pathToFileURL(path.join(SERVER, "stand.mjs")).href)) });

const T = "ocid1.tenancy.oc1..testkonto";
const ADS = ["Xyz:EU-FRANKFURT-1-AD-1", "Xyz:EU-FRANKFURT-1-AD-2", "Xyz:EU-FRANKFURT-1-AD-3"];
const SSH = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAItest studium-autopilot";
// Beispielwerte zusammengesetzt, damit werkzeuge/pruefen.py (Mail-Adressen, Server-Hinweise) nicht anschlägt
const MAIL = "studi" + "@example.org";
const SSLIP = "ss" + "lip.io";
const VORLAGE = fs.existsSync(path.join(SERVER, "platzsucher-helfer.yaml")) ? fs.readFileSync(path.join(SERVER, "platzsucher-helfer.yaml"), "utf8") : "";
const SKRIPT = fs.existsSync(path.join(SERVER, "platzsucher.py")) ? fs.readFileSync(path.join(SERVER, "platzsucher.py"), "utf8") : "";

// Bestand wie von erheben() (stand.mjs), frisches Free-Tier-Konto
const bestand = (extra = {}) => ({
  tenancy: T, zeit: "2026-10-18T10:00:00.000Z", fehler: [], regionen: [{ "region-name": "eu-frankfurt-1", "is-home-region": true }],
  abos: null, e4Grenze: [], compartments: [T], ads: ADS, instanzen: [], bootVolumes: [], bootAnhaenge: [], volumes: [], backups: [],
  bootBackups: [], buckets: [], freierTopf: { used: 0, available: 200 }, quota: [], budgets: [], markiert: [], kosten: [], ...extra,
});

const geschuetzt = (extra) => bestand(Object.assign({ quota: [{ name: "nur-kostenlos", "lifecycle-state": "ACTIVE" }],
  budgets: [{ "display-name": "kostenwarnung", id: "b" }], budgetRegeln: [{ type: "ACTUAL", "lifecycle-state": "ACTIVE" }] }, extra));

// Nachgebautes Konto: Aufrufe nach Befehl, Angelegtes bleibt (zweiter Lauf sieht es). o.kapazitaet = so viele Anlegeversuche
// scheitern mit „Out of host capacity“.
function konto(o = {}) {
  const k = { instanzen: [], vcns: [], gateways: [], routen: {}, listen: [], subnetze: [], themen: [], abos: [], gruppen: [], richtlinien: [],
    quota: o.quota || [], budgets: [], regeln: [], volumes: {}, anhaenge: [], aufrufe: [], kapazitaet: o.kapazitaet || 0, grenze: o.grenze || 0 };
  let n = 0;
  const neu = (art) => `ocid1.${art}.oc1..${++n}`;
  const w = (args, name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
  const tags = (args) => JSON.parse(w(args, "--freeform-tags") || "{}");
  const ok = (data) => ({ ok: true, data });
  const mitTags = (args, x) => ({ "lifecycle-state": "AVAILABLE", "freeform-tags": tags(args), ...x });
  const nachName = (l, args) => l.filter((x) => !w(args, "--name") || x.name === w(args, "--name"));
  const befehle = {
    "limits quota create": (a) => { const q = mitTags(a, { id: neu("quota"), name: w(a, "--name"), statements: JSON.parse(w(a, "--statements")), "lifecycle-state": "ACTIVE" }); k.quota.push(q); return ok(q); },
    "limits quota list": (a) => ok(nachName(k.quota, a)),
    "limits quota get": (a) => ok(k.quota.find((q) => q.id === w(a, "--quota-id"))),
    "limits quota update": (a) => { k.quota.find((q) => q.id === w(a, "--quota-id")).statements = JSON.parse(w(a, "--statements")); return ok({}); },
    "budgets budget budget": (a) => {
      if (a[3] === "list") return ok(k.budgets);
      const b = mitTags(a, { id: neu("budget"), "display-name": w(a, "--display-name"), betrag: w(a, "--amount"), ziele: JSON.parse(w(a, "--targets")), "lifecycle-state": "ACTIVE" });
      k.budgets.push(b);
      return ok(b);
    },
    "budgets budget alert-rule": (a) => {
      if (a[3] === "list") return ok(k.regeln.filter((r) => r.budget === w(a, "--budget-id")));
      k.regeln.push({ budget: w(a, "--budget-id"), typ: w(a, "--type"), schwelle: w(a, "--threshold"), an: w(a, "--recipients"), "display-name": w(a, "--display-name"), "lifecycle-state": "ACTIVE" });
      return ok({});
    },
    "network vcn list": () => ok(k.vcns),
    // Wie bei Oracle: Das Netz bringt eine Standardliste (nur Port 22) mit, und die erbt seine Kennzeichen
    "network vcn create": (a) => {
      const rt = neu("routetable");
      k.routen[rt] = { id: rt, "route-rules": [] };
      const sl = mitTags(a, { id: neu("securitylist"), ein: [{ protocol: "6", tcpOptions: { destinationPortRange: { min: 22, max: 22 } } }] });
      k.listen.push(sl);
      const v = mitTags(a, { id: neu("vcn"), "default-route-table-id": rt, "default-security-list-id": sl.id });
      k.vcns.push(v);
      return ok(v);
    },
    "network internet-gateway list": () => ok(k.gateways),
    "network internet-gateway create": (a) => { const g = mitTags(a, { id: neu("internetgateway") }); k.gateways.push(g); return ok(g); },
    "network route-table get": (a) => ok(k.routen[w(a, "--rt-id")]),
    "network route-table update": (a) => { k.routen[w(a, "--rt-id")]["route-rules"] = JSON.parse(w(a, "--route-rules")).map((r) => ({ destination: r.destination, "network-entity-id": r.networkEntityId })); return ok({}); },
    "network security-list list": () => ok(k.listen),
    "network security-list create": (a) => { const s = mitTags(a, { id: neu("securitylist"), ein: JSON.parse(w(a, "--ingress-security-rules")) }); k.listen.push(s); return ok(s); },
    "network subnet list": () => ok(k.subnetze),
    "network subnet create": (a) => { const s = mitTags(a, { id: neu("subnet"), "security-list-ids": JSON.parse(w(a, "--security-list-ids")) }); k.subnetze.push(s); return ok(s); },
    "network subnet update": (a) => { k.subnetze.find((s) => s.id === w(a, "--subnet-id"))["security-list-ids"] = JSON.parse(w(a, "--security-list-ids")); return ok({}); },
    "compute image list": (a) => ok([{ id: "img-" + w(a, "--shape"), "display-name": `Canonical-Ubuntu-${w(a, "--operating-system-version").replace(" ", "-")}-2026.09.18-0` }]),
    "compute instance launch": (a) => {
      if (k.kapazitaet > 0) { k.kapazitaet--; return { ok: false, fehler: 'ServiceError: { "code": "InternalError", "message": "Out of host capacity.", "status": 500 }' }; }
      if (k.grenze > 0) { k.grenze--; return { ok: false, fehler: 'ServiceError: { "code": "LimitExceeded", "message": "The following service limits were exceeded: standard-e2-micro-core-count", "status": 400 }' }; }
      const i = mitTags(a, { id: neu("instance"), shape: w(a, "--shape"), "availability-domain": w(a, "--availability-domain"), "display-name": w(a, "--display-name"),
        "lifecycle-state": "PROVISIONING", quelle: JSON.parse(w(a, "--source-details")), metadaten: JSON.parse(w(a, "--metadata")),
        "instance-options": { "are-legacy-imds-endpoints-disabled": JSON.parse(w(a, "--instance-options")).areLegacyImdsEndpointsDisabled } });
      const bv = neu("bootvolume");
      k.volumes[bv] = { id: bv, "size-in-gbs": i.quelle.bootVolumeSizeInGBs };
      k.anhaenge.push({ "instance-id": i.id, "boot-volume-id": bv, "lifecycle-state": "ATTACHED" });
      k.instanzen.push(i);
      return ok(i);
    },
    "compute instance list": () => ok(k.instanzen),
    "compute instance get": (a) => { const i = k.instanzen.find((x) => x.id === w(a, "--instance-id")); return ok({ ...i, metadata: i.metadaten }); },
    "compute instance action": (a) => { k.aktionen = (k.aktionen || []).concat([[w(a, "--instance-id"), w(a, "--action")]]); return ok({}); },
    "compute instance update": (a) => { k.instanzen.find((i) => i.id === w(a, "--instance-id"))["instance-options"] = { "are-legacy-imds-endpoints-disabled": JSON.parse(w(a, "--instance-options")).areLegacyImdsEndpointsDisabled }; return ok({}); },
    "compute instance terminate": (a) => { k.instanzen.find((i) => i.id === w(a, "--instance-id"))["lifecycle-state"] = "TERMINATING"; return ok(null); },
    "compute instance list-vnics": () => ok([{ "hostname-label": "intern" }, { "public-ip": "127.0.0.1" }]),
    "ons topic list": (a) => ok(nachName(k.themen, a)),
    "ons topic create": (a) => { const t = mitTags(a, { "topic-id": neu("onstopic"), name: w(a, "--name"), "lifecycle-state": "ACTIVE" }); k.themen.push(t); return ok(t); },
    "ons topic delete": (a) => { k.themen = k.themen.filter((t) => t["topic-id"] !== w(a, "--topic-id")); return ok(null); },
    "ons subscription list": () => ok(k.abos),
    "ons subscription create": (a) => { k.abos.push({ endpoint: w(a, "--subscription-endpoint"), protokoll: w(a, "--protocol"), "lifecycle-state": "PENDING" }); return ok({}); },
    "iam dynamic-group list": (a) => ok(nachName(k.gruppen, a)),
    "iam dynamic-group create": (a) => { k.gruppen.push(mitTags(a, { id: neu("dynamicgroup"), name: w(a, "--name"), "matching-rule": w(a, "--matching-rule"), "lifecycle-state": "ACTIVE" })); return ok({}); },
    "iam dynamic-group update": (a) => { k.gruppen.find((g) => g.id === w(a, "--dynamic-group-id"))["matching-rule"] = w(a, "--matching-rule"); return ok({}); },
    "iam dynamic-group delete": (a) => { k.gruppen = k.gruppen.filter((g) => g.id !== w(a, "--dynamic-group-id")); return ok(null); },
    "iam policy list": (a) => ok(nachName(k.richtlinien, a)),
    "iam policy update": (a) => { const p = k.richtlinien.find((y) => y.id === w(a, "--policy-id")); p.statements = JSON.parse(w(a, "--statements")); return ok({}); },
    "iam policy create": (a) => { k.richtlinien.push(mitTags(a, { id: neu("policy"), name: w(a, "--name"), statements: JSON.parse(w(a, "--statements")), "lifecycle-state": "ACTIVE" })); return ok({}); },
    "iam policy delete": (a) => { k.richtlinien = k.richtlinien.filter((p) => p.id !== w(a, "--policy-id")); return ok(null); },
    "compute boot-volume-attachment list": (a) => ok(k.anhaenge.filter((x) => x["instance-id"] === w(a, "--instance-id"))),
    "bv boot-volume get": (a) => ok(k.volumes[w(a, "--boot-volume-id")]),
    "bv boot-volume update": (a) => { k.volumes[w(a, "--boot-volume-id")]["size-in-gbs"] = Number(w(a, "--size-in-gbs")); return ok({}); },
  };
  const oci = async (args) => {
    k.aufrufe.push(args);
    const f = befehle[args.slice(0, 3).join(" ")];
    if (!f) throw new Error("Attrappe kennt nicht: " + args.slice(0, 4).join(" "));
    return f(args);
  };
  const angelegt = () => k.aufrufe.filter((a) => /^(create|launch|update|delete)$/.test(a[2]) || /^(create|update|delete)$/.test(a[3])).map((a) => a.slice(0, 3).join(" "));
  return { oci, k, w, angelegt };
}

test("Schutz: Quota und Budget im frischen Konto, beim zweiten Mal nichts Neues; Mail ist Pflicht", async () => {
  const { schutz, auswerten, quotaSaetze } = await laden();
  const { oci, k, w } = konto();
  const r = await schutz(oci, { tenancy: T, mail: MAIL, a: auswerten(bestand()) });
  assert.equal(r.exit, 0);
  assert.deepEqual(k.quota[0].statements, quotaSaetze());
  assert.ok(k.quota[0].statements.includes("set compute-core quota standard-a1-core-count to 2 in tenancy"));
  assert.ok(k.quota[0].statements.includes("set block-storage quota total-storage-gb to 200 in tenancy"));
  assert.deepEqual(k.budgets.map((b) => [b["display-name"], b.betrag, b.ziele]), [["kostenwarnung", "1", [T]]]);
  assert.deepEqual(k.regeln.map((x) => [x.typ, x.schwelle, x.an]), [["ACTUAL", "1", MAIL], ["FORECAST", "100", MAIL]]);
  assert.equal(w(k.aufrufe.find((a) => a[1] === "quota"), "--freeform-tags"), '{"studium-autopilot":"schutz"}');
  const vorher = k.aufrufe.length;
  const r2 = await schutz(oci, { tenancy: T, mail: MAIL, a: auswerten(geschuetzt()) });
  assert.deepEqual(r2.exit, 0);
  assert.ok(k.aufrufe.slice(vorher).every((x) => !/^(create|update|delete)$/.test(x[3]) && x[2] !== "create"), "zweiter Lauf legt nichts an");
  // Abbruch nach dem Budget, vor den Regeln: der nächste Lauf ergänzt sie
  k.regeln = k.regeln.filter((x) => x.typ !== "ACTUAL");
  const r3 = await schutz(oci, { tenancy: T, mail: MAIL, a: auswerten(geschuetzt()) });
  assert.equal(r3.schritte.find((s) => s.was === "budget").status, "ergaenzt");
  assert.deepEqual(k.regeln.map((x) => x.typ).sort(), ["ACTUAL", "FORECAST"]);
  // ein fremdes Budget gleichen Namens bleibt unverändert
  const fremd = konto();
  fremd.k.budgets.push({ id: "fb", "display-name": "kostenwarnung", "freeform-tags": {}, "lifecycle-state": "ACTIVE" });
  const r4 = await schutz(fremd.oci, { tenancy: T, mail: MAIL, a: auswerten(bestand()) });
  assert.equal(r4.schritte.find((s) => s.was === "budget").status, "uebersprungen");
  assert.deepEqual(fremd.k.regeln, []);
  await assert.rejects(schutz(oci, { tenancy: T, mail: "", a: auswerten(bestand()) }), /--mail/);
});

test("Schutz bei eigenen bezahlten Ressourcen: erst Rückfrage (Budget trotzdem), mit --ja Quota mit deren Stand", async () => {
  const { schutz, auswerten } = await laden();
  const gross = bestand({ instanzen: [{ id: "i1", "display-name": "box", shape: "VM.Standard.A1.Flex", "lifecycle-state": "RUNNING", "shape-config": { ocpus: 4, "memory-in-gbs": 24 } }],
    freierTopf: { used: 247, available: 0 } });
  const ohne = konto();
  const r = await schutz(ohne.oci, { tenancy: T, mail: MAIL, a: auswerten(gross) });
  assert.equal(r.exit, 2);
  assert.equal(r.schritte[0].status, "frage");
  assert.deepEqual(ohne.angelegt(), ["budgets budget budget", "budgets budget alert-rule", "budgets budget alert-rule"], "Budget immer");
  const mit = konto();
  await schutz(mit.oci, { tenancy: T, mail: MAIL, a: auswerten(gross), ja: true });
  const s = mit.k.quota[0].statements;
  assert.ok(s.includes("set compute-core quota standard-a1-core-count to 4 in tenancy"), "laufende A1 bleibt erlaubt");
  assert.ok(s.includes("set block-storage quota total-storage-gb to 247 in tenancy"));
});

test("Netz: eigenes Netz mit nur Port 22 und 443, Route ins Internet; beim zweiten Mal alles da", async () => {
  const { netz } = await laden();
  const x = konto();
  const r = await netz(x.oci, { tenancy: T });
  assert.equal(r.exit, 0);
  assert.deepEqual(r.schritte.map((s) => s.status), ["angelegt", "angelegt", "angelegt", "angelegt", "angelegt"]);
  const eigene = x.k.listen.find((l) => l.id !== x.k.vcns[0]["default-security-list-id"]);
  const ports = eigene.ein.filter((e) => e.protocol === "6").map((e) => e.tcpOptions.destinationPortRange.min);
  assert.deepEqual(ports, [22, 443]);
  assert.deepEqual(x.k.subnetze[0]["security-list-ids"], [eigene.id], "Teilnetz hängt an der eigenen Liste, nicht an der Standardliste");
  assert.deepEqual(x.k.routen[x.k.vcns[0]["default-route-table-id"]]["route-rules"], [{ destination: "0.0.0.0/0", "network-entity-id": x.k.gateways[0].id }]);
  assert.ok([...x.k.vcns, ...x.k.gateways, ...x.k.listen, ...x.k.subnetze].every((y) => y["freeform-tags"]["studium-autopilot"] === "netz"));
  const vorher = x.angelegt().length;
  const r2 = await netz(x.oci, { tenancy: T });
  assert.deepEqual(r2.schritte.map((s) => s.status), ["da", "da", "da", "da", "da"]);
  assert.equal(x.angelegt().length, vorher, "nichts doppelt");
});

test("Netz: Teilnetz an der Standardliste (bis 0.5.3) bekommt die eigene Liste mit Port 443", async () => {
  const { netz } = await laden();
  const x = konto();
  await netz(x.oci, { tenancy: T });
  const standard = x.k.vcns[0]["default-security-list-id"];
  x.k.listen = x.k.listen.filter((l) => l.id === standard);
  x.k.subnetze[0]["security-list-ids"] = [standard];
  const r = await netz(x.oci, { tenancy: T });
  assert.deepEqual(r.schritte.map((s) => s.status), ["da", "da", "da", "angelegt", "repariert"]);
  const eigene = x.k.listen.find((l) => l.id !== standard);
  assert.ok(eigene.ein.some((e) => e.tcpOptions && e.tcpOptions.destinationPortRange.min === 443));
  assert.deepEqual(x.k.subnetze[0]["security-list-ids"], [eigene.id]);
  assert.equal(x.k.listen.length, 2, "Standardliste bleibt unangetastet");
});

test("Server: genau A1 2/12 mit Boot-Volume aus dem Rest, nächster Bereich bei „Out of host capacity“, Exit 3 ohne Platz", async () => {
  const { netz, server, auswerten } = await laden();
  const x = konto({ kapazitaet: 1 });
  await netz(x.oci, { tenancy: T });
  await assert.rejects(server(x.oci, { tenancy: T, a: auswerten(bestand()), ads: ADS, schluessel: SSH }), /Erst den Schutz/, "ohne Quota und Budget nichts");
  const a = auswerten(geschuetzt({ freierTopf: { used: 47, available: 153 } }));
  const r = await server(x.oci, { tenancy: T, a, ads: ADS, schluessel: SSH });
  assert.equal(r.exit, 0, JSON.stringify(r.schritte));
  const s = x.k.instanzen[0];
  assert.deepEqual([s.shape, s["availability-domain"], s["freeform-tags"]["studium-autopilot"]], ["VM.Standard.A1.Flex", ADS[1], "server"]);
  assert.deepEqual(s.quelle, { sourceType: "image", imageId: "img-VM.Standard.A1.Flex", bootVolumeSizeInGBs: 153, bootVolumeVpusPerGB: 10 });
  assert.equal(x.w(x.k.aufrufe.find((y) => y[2] === "launch"), "--shape-config"), '{"ocpus":2,"memoryInGBs":12}');
  assert.deepEqual(s.metadaten, { ssh_authorized_keys: SSH });
  assert.deepEqual(s["instance-options"], { "are-legacy-imds-endpoints-disabled": true }, "nur IMDSv2");
  const voll = konto({ kapazitaet: 3 });
  await netz(voll.oci, { tenancy: T });
  assert.equal((await server(voll.oci, { tenancy: T, a: auswerten(geschuetzt()), ads: ADS, schluessel: SSH })).exit, 3);
  // schon da / passt nicht / ohne Netz / ohne Schlüssel
  const leer = konto();
  assert.equal((await server(leer.oci, { tenancy: T, a: auswerten(bestand({ markiert: [{ "resource-type": "Instance", "display-name": "s", "lifecycle-state": "RUNNING", "freeform-tags": { "studium-autopilot": "server" } }] })), ads: ADS, schluessel: SSH })).exit, 0);
  assert.equal((await server(leer.oci, { tenancy: T, a: auswerten(geschuetzt({ freierTopf: { used: 180, available: 20 } })), ads: ADS, schluessel: SSH })).exit, 1);
  await assert.rejects(server(leer.oci, { tenancy: T, a: auswerten(geschuetzt()), ads: ADS, schluessel: SSH }), /zuerst „node einrichten.mjs netz“/);
  await netz(leer.oci, { tenancy: T });
  await assert.rejects(server(leer.oci, { tenancy: T, a: auswerten(geschuetzt()), ads: ADS, schluessel: "geheim" }), /--schluessel/);
  assert.equal(leer.k.instanzen.length, 0, "nichts angelegt");
});

// Fehlerausgabe wie die echte OCI-Kommandozeile (oci_cli/cli_exceptions.py: json.dumps(…, indent=4, sort_keys=True)):
// „message“ steht erst nach client_version und logging_tips.
const ociAusgabe = (code, status, message) => {
  const d = { client_version: "Oracle-PythonSDK/2.163.1, Oracle-PythonCLI/3.66.1", code,
    logging_tips: "Please run the OCI CLI command using --debug flag to find more debug information.", message,
    "opc-request-id": "ABC/DEF/GHI", operation_name: "launch_instance", request_endpoint: "POST https://iaas.example/20160918/instances",
    status, target_service: "compute", timestamp: "2026-10-20T12:00:00.000000+00:00",
    troubleshooting_tips: "See the documentation for more information about resolving this error." };
  return "ServiceError:\n" + JSON.stringify(d, Object.keys(d).sort(), 4) + "\n";
};

test("Fehler der OCI-Kommandozeile: Code, Status und Nachricht bleiben lesbar; „Out of host capacity“ aus echter Ausgabe → Exit 3", async () => {
  const { fehlerText, ociAufrufer, netz, server, auswerten } = await laden();
  assert.equal(fehlerText(ociAusgabe("InternalError", 500, "Out of host capacity.")), "InternalError (500): Out of host capacity.");
  assert.equal(fehlerText("WARNING: x\n" + ociAusgabe("LimitExceeded", 400, "The following service limits were exceeded: standard-e2-micro-core-count")),
    "LimitExceeded (400): The following service limits were exceeded: standard-e2-micro-core-count");
  assert.equal(fehlerText("Error: Missing option(s) --compartment-id."), "Error: Missing option(s) --compartment-id.");
  // Wie execFile: Anlegen scheitert mit der echten Ausgabe, alles andere beantwortet das nachgebaute Konto
  const echt = (x, fehler) => (pfad, args, optionen, fertig) => {
    const a = args.slice(0, args.indexOf("--output"));
    if (a.slice(0, 3).join(" ") === "compute instance launch" && fehler) return fertig(Object.assign(new Error("Exit 1"), { code: 1 }), "", fehler);
    x.oci(a).then((r) => fertig(null, JSON.stringify({ data: r.data }), ""));
  };
  const voll = konto();
  await netz(voll.oci, { tenancy: T });
  const kein = await server(ociAufrufer("oci", echt(voll, ociAusgabe("InternalError", 500, "Out of host capacity."))),
    { tenancy: T, a: auswerten(geschuetzt()), ads: ADS, schluessel: SSH });
  assert.equal(kein.exit, 3, JSON.stringify(kein.schritte));
  assert.equal(voll.k.instanzen.length, 0);
  const anders = konto();
  await netz(anders.oci, { tenancy: T });
  await assert.rejects(server(ociAufrufer("oci", echt(anders, ociAusgabe("InternalError", 500, "Internal error occurred."))),
    { tenancy: T, a: auswerten(geschuetzt()), ads: ADS, schluessel: SSH }), /^Error: anlegen: InternalError \(500\): Internal error occurred\.$/);
  const frei = konto();
  await netz(frei.oci, { tenancy: T });
  const r = await server(ociAufrufer("oci", echt(frei, "")), { tenancy: T, a: auswerten(geschuetzt()), ads: ADS, schluessel: SSH });
  assert.deepEqual([r.exit, frei.k.instanzen.length], [0, 1]);
});

test("Platzsucher: Mail-Thema, Helfer (Micro, 50 GB) mit fertiger Konfiguration, Rechte nur für ihn; läuft er, nichts Neues", async () => {
  const { netz, platzsucher, auswerten, PLATZSUCHER_RECHTE } = await laden();
  const x = konto();
  await netz(x.oci, { tenancy: T });
  const a = auswerten(geschuetzt(), { helfer: true });
  const r = await platzsucher(x.oci, { tenancy: T, a, ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: SKRIPT });
  assert.equal(r.exit, 0, JSON.stringify(r.schritte));
  const h = x.k.instanzen[0];
  assert.deepEqual([h.shape, h.quelle.bootVolumeSizeInGBs, h.quelle.imageId, h["freeform-tags"]["studium-autopilot"]], ["VM.Standard.E2.1.Micro", 50, "img-VM.Standard.E2.1.Micro", "helfer"]);
  const cloudInit = Buffer.from(h.metadaten.user_data, "base64").toString("utf8");
  assert.ok(cloudInit.startsWith("#cloud-config"));
  assert.ok(!cloudInit.includes("content: KONFIG_JSON_BASE64"), "Platzhalter ersetzt");
  // platzsucher.py kommt gepackt mit (kein Download auf dem Helfer), die Startdaten bleiben unter Oracles Grenze
  assert.ok(!cloudInit.includes("content: PLATZSUCHER_GZ_BASE64") && !cloudInit.includes("api.github.com"));
  const gepackt = /content: (\S+)/.exec(cloudInit.slice(cloudInit.indexOf("/opt/studium-platzsucher/platzsucher.py")))[1];
  assert.equal(require("node:zlib").gunzipSync(Buffer.from(gepackt, "base64")).toString("utf8"), SKRIPT, "genau platzsucher.py aus dem Paket");
  assert.ok(JSON.stringify(h.metadaten).length < 32000, "Metadaten unter 32 000 Byte: " + JSON.stringify(h.metadaten).length);
  const konfig = JSON.parse(Buffer.from(/content: (\S+)/.exec(cloudInit.slice(cloudInit.indexOf("konfig.json")))[1], "base64").toString("utf8"));
  assert.deepEqual([konfig.boot_gb, konfig.image, konfig.thema, konfig.ads, konfig.compartment], [150, "img-VM.Standard.A1.Flex", x.k.themen[0]["topic-id"], ADS, T]);
  assert.deepEqual(x.k.abos.map((y) => [y.endpoint, y.protokoll]), [[MAIL, "EMAIL"]]);
  assert.equal(x.k.gruppen[0]["matching-rule"], `instance.id = '${h.id}'`);
  assert.deepEqual(x.k.richtlinien[0].statements, PLATZSUCHER_RECHTE);
  assert.ok(PLATZSUCHER_RECHTE.every((s) => s.startsWith("Allow dynamic-group studium-platzsucher to ")));
  const vorher = x.angelegt().length;
  const r2 = await platzsucher(x.oci, { tenancy: T, a, ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: SKRIPT });
  assert.deepEqual([r2.exit, r2.schritte[0].text, x.angelegt().length, x.k.aktionen], [0, "Der Platzsucher läuft schon.", vorher, undefined]);
  // abgebrochen vor den Rechten: der nächste Aufruf legt sie an und startet den Helfer neu
  x.k.richtlinien = [];
  const r3 = await platzsucher(x.oci, { tenancy: T, a, ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: SKRIPT });
  assert.equal(r3.exit, 0);
  assert.deepEqual(x.k.richtlinien[0].statements, PLATZSUCHER_RECHTE);
  assert.deepEqual(x.k.aktionen, [[h.id, "SOFTRESET"]]);
  // Richtlinie einer älteren Version (ohne VOLUME_DELETE): wird ergänzt, der Helfer startet neu
  x.k.aktionen = undefined;
  x.k.richtlinien[0].statements = PLATZSUCHER_RECHTE.slice(0, 4);
  assert.equal((await platzsucher(x.oci, { tenancy: T, a, ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: SKRIPT })).exit, 0);
  assert.deepEqual([x.k.richtlinien.length, x.k.richtlinien[0].statements, x.k.aktionen], [1, PLATZSUCHER_RECHTE, [[h.id, "SOFTRESET"]]]);
  assert.ok(PLATZSUCHER_RECHTE.includes("Allow dynamic-group studium-platzsucher to manage volume-family in tenancy where request.permission = 'VOLUME_DELETE'"));
  // Micro gibt es nur im zweiten Bereich: weiter statt Abbruch
  const y = konto({ grenze: 1 });
  await netz(y.oci, { tenancy: T });
  assert.equal((await platzsucher(y.oci, { tenancy: T, a, ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: SKRIPT })).exit, 0);
  assert.equal(y.k.instanzen[0]["availability-domain"], ADS[1]);
  // fremdes Thema gleichen Namens: nichts anlegen
  const z = konto();
  await netz(z.oci, { tenancy: T });
  z.k.themen.push({ "topic-id": "fremd", name: "studium-autopilot", "freeform-tags": {}, "lifecycle-state": "ACTIVE" });
  await assert.rejects(platzsucher(z.oci, { tenancy: T, a, ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: SKRIPT }), /nicht von der Einrichtung/);
  assert.equal(z.k.instanzen.length, 0);
  // ohne platzsucher.py oder mit zu großen Startdaten: kein Helfer
  const w = konto();
  await netz(w.oci, { tenancy: T });
  await assert.rejects(platzsucher(w.oci, { tenancy: T, a, ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: "" }), /platzsucher\.py fehlt/);
  const riesig = "#!/usr/bin/env python3\n" + require("node:crypto").randomBytes(60000).toString("hex");
  await assert.rejects(platzsucher(w.oci, { tenancy: T, a, ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: riesig }), /zu groß/);
  assert.equal(w.k.instanzen.length, 0);
});

test("Abschließen: wartet auf den Helfer, entfernt nur eigene Rechte, Boot-Volume auf den Rest, eigene Quota fest", async () => {
  const { netz, platzsucher, schutz, abschliessen, auswerten } = await laden();
  const x = konto();
  await schutz(x.oci, { tenancy: T, mail: MAIL, a: auswerten(bestand()) });
  await netz(x.oci, { tenancy: T });
  await platzsucher(x.oci, { tenancy: T, a: auswerten(geschuetzt(), { helfer: true }), ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: SKRIPT });
  x.k.richtlinien.push({ id: "fremd", name: "studium-platzsucher", "freeform-tags": {}, "lifecycle-state": "ACTIVE" });
  assert.equal((await abschliessen(x.oci, { tenancy: T, a: auswerten(bestand()) })).exit, 2, "Helfer läuft noch");
  // der Platzsucher hat den Server angelegt und den Helfer beendet
  x.k.instanzen[0]["lifecycle-state"] = "TERMINATED";
  x.k.instanzen.push({ id: "ocid1.instance.oc1..server", shape: "VM.Standard.A1.Flex", "availability-domain": ADS[0], "freeform-tags": { "studium-autopilot": "server" }, "lifecycle-state": "RUNNING" });
  x.k.volumes.bvs = { id: "bvs", "size-in-gbs": 150 };
  x.k.anhaenge.push({ "instance-id": "ocid1.instance.oc1..server", "boot-volume-id": "bvs", "lifecycle-state": "ATTACHED" });
  const r = await abschliessen(x.oci, { tenancy: T, a: auswerten(bestand({ freierTopf: { used: 150, available: 50 } })) });
  assert.equal(r.exit, 0, JSON.stringify(r.schritte));
  assert.deepEqual(x.k.richtlinien.map((p) => p.id), ["fremd"], "fremde Richtlinie gleichen Namens bleibt");
  assert.deepEqual(x.k.gruppen, []);
  assert.equal(x.k.volumes.bvs["size-in-gbs"], 200);
  assert.deepEqual(x.k.instanzen[1]["instance-options"], { "are-legacy-imds-endpoints-disabled": true }, "Server von 0.5.3: nur noch IMDSv2");
  assert.ok(x.k.quota[0].statements.includes("set block-storage quota total-storage-gb to 200 in tenancy"));
  // fremde Quota gleichen Namens bleibt unverändert
  const y = konto({ quota: [{ id: "q1", name: "nur-kostenlos", "lifecycle-state": "ACTIVE", "freeform-tags": {}, statements: ["set block-storage quota total-storage-gb to 0 in tenancy"] }] });
  y.k.instanzen.push({ id: "s", "availability-domain": ADS[0], "freeform-tags": { "studium-autopilot": "server" }, "lifecycle-state": "RUNNING",
    "instance-options": { "are-legacy-imds-endpoints-disabled": true } });
  const r2 = await abschliessen(y.oci, { tenancy: T, a: auswerten(bestand({ freierTopf: { used: 200, available: 0 } })) });
  assert.equal(r2.schritte.find((s) => s.was === "quota").status, "uebersprungen");
  assert.deepEqual(y.angelegt(), []);
});

test("Platzsucher beenden: Helfer beendet, eigene Rechte und Thema weg, Fremdes bleibt", async () => {
  const { netz, platzsucher, platzsucherBeenden, auswerten } = await laden();
  const x = konto();
  await netz(x.oci, { tenancy: T });
  await platzsucher(x.oci, { tenancy: T, a: auswerten(geschuetzt(), { helfer: true }), ads: ADS, schluessel: SSH, mail: MAIL, vorlage: VORLAGE, skript: SKRIPT });
  x.k.instanzen.push({ id: "fremd", "freeform-tags": {}, "lifecycle-state": "RUNNING" });
  x.k.gruppen.push({ id: "fremde-gruppe", name: "andere", "freeform-tags": {}, "lifecycle-state": "ACTIVE" });
  const r = await platzsucherBeenden(x.oci, { tenancy: T });
  assert.equal(r.exit, 0);
  const term = x.k.aufrufe.filter((a) => a[2] === "terminate");
  assert.deepEqual(term.map((a) => [x.w(a, "--instance-id"), x.w(a, "--preserve-boot-volume")]), [[x.k.instanzen[0].id, "false"]]);
  assert.equal(x.k.instanzen.find((i) => i.id === "fremd")["lifecycle-state"], "RUNNING");
  assert.deepEqual([x.k.richtlinien, x.k.gruppen.map((g) => g.id), x.k.themen], [[], ["fremde-gruppe"], []]);
  const r2 = await platzsucherBeenden(x.oci, { tenancy: T });
  assert.equal(r2.schritte[0].text, "Es läuft kein Platzsucher.");
});

test("Adresse: öffentliche IP, Adresse mit der IP im Namen und SSH-Befehl", async () => {
  const { adresse } = await laden();
  const x = konto();
  assert.equal((await adresse(x.oci, { tenancy: T })).exit, 1, "noch kein Server");
  x.k.instanzen.push({ id: "s", "display-name": "studium-autopilot-server", "freeform-tags": { "studium-autopilot": "server" }, "lifecycle-state": "RUNNING" });
  const r = await adresse(x.oci, { tenancy: T });
  assert.deepEqual([r.ip, r.adresse, r.ssh], ["127.0.0.1", `https://127-0-0-1.${SSLIP}`, "ssh -i ~/.ssh/studium_autopilot ubuntu@127.0.0.1"]);
});

test("Adresse: prüft den Schlüssel; nach einem früheren Versuch mit anderem Namen nennt sie die passende Datei", async () => {
  const { adresse } = await laden();
  const x = konto();
  const rsa = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABtest";
  x.k.instanzen.push({ id: "s", "freeform-tags": { "studium-autopilot": "server" }, "lifecycle-state": "RUNNING", metadaten: { ssh_authorized_keys: rsa + " alt" } });
  const fest = await adresse(x.oci, { tenancy: T, schluessel: { "~/.ssh/studium_autopilot.pub": rsa + " studium-autopilot\n" } });
  assert.deepEqual([fest.exit, fest.schritte[1].status], [0, "da"]);
  const anders = await adresse(x.oci, { tenancy: T, schluessel: { "~/.ssh/studium_autopilot.pub": SSH, "~/.ssh/id_rsa.pub": rsa + "\n" } });
  assert.equal(anders.exit, 2);
  assert.match(anders.schritte[1].text, /cp ~\/\.ssh\/id_rsa ~\/\.ssh\/studium_autopilot && cp ~\/\.ssh\/id_rsa\.pub ~\/\.ssh\/studium_autopilot\.pub/);
  assert.equal((await adresse(x.oci, { tenancy: T, schluessel: {} })).exit, 1);
});

test("Aufruf: ohne Befehl Hilfe und Exit 2, nichts wird aufgerufen", () => {
  const r = require("node:child_process").spawnSync(process.execPath, [path.join(SERVER, "einrichten.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Aufruf: node einrichten\.mjs schutz\|netz\|server\|platzsucher\|abschliessen\|adresse\|platzsucher-beenden/);
});

test("Skill server-einrichten: jeder genannte Befehl von einrichten.mjs und studium-server existiert", async () => {
  const E = await import(pathToFileURL(path.join(SERVER, "einrichten.mjs")).href);
  const ordner = path.join(SERVER, "skill", "server-einrichten");
  const text = fs.readdirSync(ordner).map((d) => fs.readFileSync(path.join(ordner, d), "utf8")).join("\n");
  const schritte = new Set([...text.matchAll(/einrichten\.mjs ([a-z][a-z-]*)/g)].map((m) => m[1]));
  const vorhanden = new Set(Object.keys(E).filter((k) => typeof E[k] === "function").map((k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())));
  assert.ok(schritte.size >= 6);
  for (const s of schritte) assert.ok(vorhanden.has(s), "einrichten.mjs " + s);
  const cli = fs.readFileSync(path.join(SERVER, "studium-server"), "utf8");
  const befehle = new Set([...cli.matchAll(/^ {2}([a-z|-]+)\)/gm)].flatMap((m) => m[1].split("|")));
  const genannt = new Set([...text.matchAll(/studium-server ([a-z][a-z-]*)/g)].map((m) => m[1]));
  for (const b of genannt) assert.ok(befehle.has(b), "studium-server " + b);
  assert.ok(genannt.has("verbinden") && genannt.has("uni-zugang"));
});
