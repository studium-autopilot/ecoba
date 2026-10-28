// Tests für server/stand.mjs (Stand eines Oracle-Kontos, server/README.md). Ohne Netz: die OCI-Kommandozeile ist eine
// Attrappe. Ohne server/ (noch nicht Teil des Releases) werden die Tests übersprungen statt rot.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const DATEI = path.join(__dirname, "..", "server", "stand.mjs");
const test = (name, fn) => require("node:test")(name, { skip: !fs.existsSync(DATEI) && "server/ fehlt in diesem Baum" }, fn);

const laden = () => import(pathToFileURL(DATEI).href);
const KONTO = "ocid1.tenancy.oc1..testkonto";

// Leerer Bestand eines frischen Kontos; Felder wie von erheben() geliefert.
function bestand(extra = {}) {
  return {
    tenancy: KONTO, zeit: "2026-10-17T18:00:00.000Z", fehler: [],
    regionen: [{ "region-name": "eu-frankfurt-1", "is-home-region": true }],
    abos: null, e4Grenze: [], compartments: [KONTO], ads: ["AD-1"],
    instanzen: [], bootVolumes: [], bootAnhaenge: [], volumes: [], backups: [], bootBackups: [], buckets: [],
    freierTopf: { used: 0, available: 200 }, quota: [], budgets: [], budgetRegeln: [], markiert: [], kosten: [],
    ...extra,
  };
}

// Ein älteres Pay-As-You-Go-Konto: A1 4/24 (über der freien Menge), zwei Boot-Volumes (eines lose), Kosten im Monat.
function altesKonto() {
  return bestand({
    abos: { items: [{ "payment-model": "PAYG" }] },
    instanzen: [{ id: "i1", "display-name": "box", shape: "VM.Standard.A1.Flex", "lifecycle-state": "RUNNING",
      "shape-config": { ocpus: 4, "memory-in-gbs": 24 } }],
    bootVolumes: [
      { id: "b1", "display-name": "box (Boot Volume)", "size-in-gbs": 47, "vpus-per-gb": 10, "lifecycle-state": "AVAILABLE" },
      { id: "b2", "display-name": "alt", "size-in-gbs": 47, "vpus-per-gb": 10, "lifecycle-state": "AVAILABLE" },
    ],
    bootAnhaenge: [{ "boot-volume-id": "b1", "lifecycle-state": "ATTACHED" }],
    bootBackups: [1, 2, 3, 4].map((n) => ({ "display-name": "b" + n, "lifecycle-state": "AVAILABLE" })),
    freierTopf: { used: 94, available: 106 },
    quota: [{ name: "nur-kostenlos", "lifecycle-state": "ACTIVE" }],
    budgets: [{ "display-name": "kostenwarnung" }],
    budgetRegeln: [{ type: "ACTUAL", "lifecycle-state": "ACTIVE" }, { type: "FORECAST", "lifecycle-state": "ACTIVE" }],
    kosten: [
      { service: "Block Storage", "sku-name": "Block Volume - Storage", "computed-amount": 1.95, currency: "EUR" },
      { service: "Block Storage", "sku-name": "Block Volume - Performance Units", "computed-amount": 1.3, currency: "EUR" },
      { service: "Compute", "sku-name": "A1", "computed-amount": 0, currency: "EUR" },
    ],
  });
}

test("frisches Free-Tier-Konto: größter freier Server passt, Boot-Volume = ganzer Topf, Schutz fehlt noch", async () => {
  const { auswerten } = await laden();
  const a = auswerten(bestand({ e4Grenze: [{ value: 0 }, { value: 0 }] }));
  assert.equal(a.konto.typ, "free");
  assert.equal(a.plan.status, "passt");
  assert.deepEqual([a.plan.ocpu, a.plan.gb, a.plan.bootGb], [2, 12, 200]);
  assert.equal(a.exit, 0, "Hinweise allein sind keine Kosten");
  assert.ok(a.befunde.some((f) => f.text.includes("nur-kostenlos")));
  assert.ok(a.befunde.some((f) => f.text.includes("kostenwarnung")));
});

test("mit Platzsucher: Boot-Volume 50 GB kleiner, Micro-Platz nötig", async () => {
  const { auswerten } = await laden();
  assert.equal(auswerten(bestand(), { helfer: true }).plan.bootGb, 150);
  const zweiMicro = bestand({ instanzen: [1, 2].map((n) => ({ id: "m" + n, shape: "VM.Standard.E2.1.Micro", "lifecycle-state": "RUNNING" })) });
  const a = auswerten(zweiMicro, { helfer: true });
  assert.equal(a.plan.status, "passt-nicht");
  assert.match(a.plan.text, /Micro-Platz/);
});

test("älteres Pay-As-You-Go-Konto: Kosten, A1 über der freien Menge, loses Boot-Volume, kein Platz für neuen Server", async () => {
  const { auswerten, text } = await laden();
  const a = auswerten(altesKonto());
  assert.equal(a.konto.typ, "payg");
  assert.equal(a.exit, 1);
  assert.equal(a.kosten.length, 2, "nur Beträge über 0");
  assert.ok(a.befunde.some((f) => f.art === "grenze" && f.text.includes("4 OCPU / 24 GB")));
  assert.ok(a.befunde.some((f) => f.art === "hinweis" && f.text.includes("„alt“")));
  assert.deepEqual([a.belegt.speicherGb, a.rest.speicherGb, a.belegt.backups], [94, 106, 4]);
  assert.equal(a.plan.status, "passt-nicht");
  assert.deepEqual(a.schutz, { quota: true, budget: true });
  const t = text(a);
  assert.match(t, /Kosten diesen Monat: 3,25 EUR/);
  assert.ok(a.befunde.some((f) => f.text.includes("1,95 EUR")));
  assert.match(t, /Blockspeicher 94 \/ 200 GB \(Rest 106 GB\)/);
});

test("höhere Leistung, fremde Formen und zu viele Backups gelten als Grenze", async () => {
  const { auswerten } = await laden();
  const a = auswerten(bestand({
    volumes: [{ "display-name": "schnell", "size-in-gbs": 50, "vpus-per-gb": 20, "lifecycle-state": "AVAILABLE" }],
    instanzen: [{ "display-name": "x86", shape: "VM.Standard.E4.Flex", "lifecycle-state": "RUNNING" }],
    backups: [1, 2, 3, 4, 5, 6].map(() => ({ "lifecycle-state": "AVAILABLE" })),
  }));
  assert.equal(a.exit, 1);
  for (const teil of ["„schnell“", "VM.Standard.E4.Flex", "6 Backups"]) assert.ok(a.befunde.some((f) => f.text.includes(teil)), teil);
});

test("ohne Angabe von Oracle wird der freie Topf aus den Volumes gerechnet; gestoppte A1 zählen nicht", async () => {
  const { auswerten } = await laden();
  const a = auswerten(bestand({
    freierTopf: null,
    instanzen: [{ shape: "VM.Standard.A1.Flex", "lifecycle-state": "STOPPED", "shape-config": { ocpus: 2, "memory-in-gbs": 12 } }],
    bootVolumes: [{ id: "b", "size-in-gbs": 80, "lifecycle-state": "AVAILABLE" }],
    bootAnhaenge: [{ "boot-volume-id": "b", "lifecycle-state": "ATTACHED" }],
  }));
  assert.deepEqual([a.rest.speicherGb, a.rest.speicherQuelle], [120, "gerechnet"]);
  assert.equal(a.belegt.ocpu, 0);
  assert.equal(a.plan.bootGb, 120);
});

test("schon angelegter Server wird erkannt, nicht neu geplant", async () => {
  const { auswerten } = await laden();
  const a = auswerten(bestand({ markiert: [{ "resource-type": "Instance", "display-name": "studium-server", "lifecycle-state": "RUNNING" }] }));
  assert.equal(a.plan.status, "da");
  assert.deepEqual(a.studiumAutopilot, [{ typ: "Instance", name: "studium-server" }]);
});

test("Platzsucher: Stand aus dem Kennzeichen des Helfers; angehalten, ohne Meldung, gestoppt", async () => {
  const { auswerten, text, STAND_KENNZEICHEN } = await laden();
  const helfer = (stand, extra = {}) => ({ id: "h", shape: "VM.Standard.E2.1.Micro", "lifecycle-state": "RUNNING",
    "time-created": "2026-10-17T10:00:00.123000+00:00", "freeform-tags": { "studium-autopilot": "helfer", ...(stand ? { [STAND_KENNZEICHEN]: stand } : {}) }, ...extra });
  const mit = (h) => auswerten(bestand({ instanzen: [h] })); // Stand 2026-10-17 18:00 UTC
  const s = mit(helfer("zeit=2026-10-17T17:30:00+00:00;versuche=96;art=weiter;grund=kein Platz"));
  assert.deepEqual([s.platzsucher.status, s.platzsucher.meldung.versuche, s.plan.status], ["sucht", 96, "passt"]);
  assert.match(text(s), /^Platzsucher: sucht seit 2026-10-17 10:00 UTC, 96 Versuche, zuletzt 2026-10-17 17:30 UTC: kein Platz\.$/m);
  assert.match(mit(helfer("zeit=2026-10-17T17:30:00+00:00;versuche=9;art=drossel;grund=Too many requests for user")).platzsucher.text,
    /zuletzt 2026-10-17 17:30 UTC: Oracle bremst \(zu viele Anfragen\)\.$/);
  const halt = mit(helfer("zeit=2026-10-17T11:00:00+00:00;versuche=4;art=halt;grund=LimitExceeded: x"));
  assert.deepEqual([halt.platzsucher.status, halt.platzsucher.text], ["angehalten", "Platzsucher: angehalten am 2026-10-17 11:00 UTC nach 4 Versuchen: LimitExceeded: x"]);
  // ohne Meldung: in den ersten drei Stunden startet er; danach (oder mit alter Meldung) sucht er nicht oder ist zu alt dafür
  assert.equal(mit(helfer("", { "time-created": "2026-10-17T16:00:00.000000+00:00" })).platzsucher.status, "startet");
  assert.match(mit(helfer("")).platzsucher.text, /^Platzsucher: Der Helfer läuft seit 2026-10-17 10:00 UTC, meldet aber keinen Stand \(ältere Version, oder er sucht nicht\)\.$/);
  assert.match(mit(helfer("zeit=2026-10-17T12:00:00+00:00;versuche=5;art=weiter;grund=kein Platz")).platzsucher.text, /seit 2026-10-17 12:00 UTC keinen Stand mehr/);
  assert.equal(mit(helfer("kaputt")).platzsucher.status, "still");
  assert.equal(mit(helfer("zeit=2026-10-17T17:30:00+00:00;versuche=96;art=weiter;grund=kein Platz", { "lifecycle-state": "STOPPED" })).platzsucher.status, "aus");
  const ohne = auswerten(bestand());
  assert.equal(ohne.platzsucher, null);
  assert.doesNotMatch(text(ohne), /Platzsucher/);
});

test("Budget ohne Mail-Regel für echte Kosten zählt nicht als Schutz", async () => {
  const { auswerten } = await laden();
  const ohne = auswerten(bestand({ budgets: [{ "display-name": "kostenwarnung", id: "b" }], budgetRegeln: [{ type: "FORECAST", "lifecycle-state": "ACTIVE" }] }));
  assert.equal(ohne.schutz.budget, false);
  assert.ok(ohne.befunde.some((f) => f.text.startsWith("Schutz unvollständig: Budget")));
  const mit = auswerten(bestand({ budgets: [{ "display-name": "kostenwarnung", id: "b" }], budgetRegeln: [{ type: "ACTUAL", "lifecycle-state": "ACTIVE" }] }));
  assert.equal(mit.schutz.budget, true);
});

test("Kontotyp: Abo vor Grenzwerten, sonst unklar", async () => {
  const { kontotyp } = await laden();
  assert.equal(kontotyp(bestand({ abos: { items: [{ "payment-model": "FREE_TIER" }] } })).typ, "free");
  assert.equal(kontotyp(bestand({ abos: { items: [{ "payment-model": "TRIAL" }] } })).typ, "test");
  assert.equal(kontotyp(bestand({ e4Grenze: [{ value: 100 }] })).typ, "test-oder-payg");
  assert.equal(kontotyp(bestand()).typ, "unbekannt");
});

test("erheben: nur lesende Befehle, Fehler einzelner Abfragen machen die Prüfung unvollständig statt abzubrechen", async () => {
  const { erheben, auswerten } = await laden();
  const aufrufe = [];
  const oci = async (args) => {
    aufrufe.push(args);
    if (args[0] === "usage-api") return { ok: false, fehler: "NotAuthorized" };
    if (args.join(" ") === "os ns get") return { ok: true, data: "ns" };
    if (args[0] === "iam" && args[1] === "availability-domain") return { ok: true, data: [{ name: "AD-1" }] };
    if (args[0] === "os" && args[1] === "bucket" && args[2] === "list") return { ok: true, data: [{ name: "eimer" }] };
    if (args[0] === "os" && args[1] === "bucket" && args[2] === "get") return { ok: true, data: { name: "eimer", "approximate-size": 1e9 } };
    return { ok: true, data: [] };
  };
  const b = await erheben(oci, { tenancy: KONTO, jetzt: new Date("2026-10-17T18:00:00Z") });
  const schreibend = /^(create|update|delete|terminate|launch|attach|detach|change|put|post|action|stop|start|reset|move)\b/;
  for (const a of aufrufe) {
    const verben = a.filter((x) => !x.startsWith("--") && !x.startsWith("ocid1") && !x.includes(" "));
    assert.ok(!verben.some((v) => schreibend.test(v)), "schreibender Befehl: " + a.join(" "));
  }
  const kosten = aufrufe.find((a) => a[0] === "usage-api");
  assert.ok(kosten.includes("2026-10-01T00:00:00Z") && kosten.includes("2026-10-18T00:00:00Z"), "laufender Monat bis morgen");
  assert.equal(b.buckets[0]["approximate-size"], 1e9);
  const a = auswerten(b);
  assert.equal(a.exit, 2);
  assert.ok(a.befunde.some((f) => f.text.startsWith("Nicht geprüft: Kosten")));
});

test("Konto finden: --tenancy, dann OCI_TENANCY, dann ~/.oci/config", async () => {
  const { tenancyFinden } = await laden();
  assert.equal(tenancyFinden("a", { OCI_TENANCY: "b" }, "tenancy=c"), "a");
  assert.equal(tenancyFinden(undefined, { OCI_TENANCY: "b" }, "tenancy=c"), "b");
  assert.equal(tenancyFinden(undefined, {}, "[DEFAULT]\nuser=u\ntenancy=c\n"), "c");
  assert.equal(tenancyFinden(undefined, {}, ""), "");
});
