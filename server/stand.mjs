#!/usr/bin/env node
// Stand eines Oracle-Kontos für die Einrichtung „Eigener Server mit Claude“: Kontotyp, Rest jeder freien Menge,
// Kosten des Monats, Schutz (Quota, Budget) und was Studium Autopilot dort schon angelegt hat. Regeln: server/README.md.
// Nur lesend: ruft die OCI-Kommandozeile ausschließlich mit list/get/Such- und Abfrage-Befehlen auf (tests/stand.test.js).
// Aufruf in der Oracle Cloud Shell (dort ist `oci` schon angemeldet):
//   node stand.mjs              Übersicht
//   node stand.mjs --kosten     Kostenprüfung, Exit 0 = alles kostenlos, 1 = Kosten oder Grenze überschritten, 2 = unvollständig
//   node stand.mjs --json       Ergebnis als JSON (für den Skill)
//   node stand.mjs --helfer     Rest-Rechnung mit Platzsucher-Helfer (E2.1.Micro, 50 GB Boot-Volume, server/README.md)
//   --oci <pfad>  andere OCI-Kommandozeile   --tenancy <ocid>  Konto (sonst $OCI_TENANCY bzw. ~/.oci/config)
import { execFile } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Always-Free-Mengen laut Oracle (docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm, geprüft 17.10.2026):
// A1 1.500 OCPU-h + 9.000 GB-h im Monat = 2 OCPU / 12 GB dauerhaft; 2 Micro-Instanzen; 200 GB Blockspeicher
// (Boot- und Block-Volumes zusammen, eigener Topf); 5 Volume-Backups; 20 GB Objektspeicher.
export const FREI = { a1Ocpu: 2, a1Gb: 12, micro: 2, speicherGb: 200, backups: 5, objektGb: 20, vpu: 10 };
// Ziel der Einrichtung: der größte freie Server; Mindestgröße eines Boot-Volumes bei Oracle 50 GB.
export const ZIEL = { ocpu: 2, gb: 12, bootMinGb: 50, helferBootGb: 50 };
export const KENNZEICHEN = "studium-autopilot";
const A1 = "VM.Standard.A1.Flex";
const MICRO = "VM.Standard.E2.1.Micro";
const WEG = new Set(["TERMINATED", "TERMINATING"]);

const zahl = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const summe = (liste, f) => liste.reduce((s, x) => s + zahl(f(x)), 0);
const kurz = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 200);
const liste = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.items) ? d.items : []);
const lebt = (x) => !WEG.has(x["lifecycle-state"]);
const unsere = (x) => Object.prototype.hasOwnProperty.call(x["freeform-tags"] || {}, KENNZEICHEN);

// Startet `oci … --output json` und liefert { ok, data } bzw. { ok: false, fehler }; wirft nie.
export function ociAufrufer(pfad = "oci") {
  return (args) => new Promise((fertig) => {
    execFile(pfad, [...args, "--output", "json"],
      { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, SUPPRESS_LABEL_WARNING: "True" } },
      (err, stdout, stderr) => {
        if (err) return fertig({ ok: false, fehler: kurz(stderr || err.message) });
        const roh = String(stdout || "");
        if (!roh.trim()) return fertig({ ok: true, data: null });
        try {
          fertig({ ok: true, data: JSON.parse(roh.slice(roh.indexOf("{"))).data ?? null });
        } catch (e) {
          fertig({ ok: false, fehler: "Antwort ist kein JSON" });
        }
      });
  });
}

// Erster und morgiger Tag (UTC) für die Kostenabfrage des laufenden Monats.
export function monat(jetzt = new Date()) {
  const tag = (d) => d.toISOString().slice(0, 10) + "T00:00:00Z";
  const start = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), 1));
  const morgen = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate() + 1));
  return { start: tag(start), ende: tag(morgen) };
}

// Sammelt den Bestand. `oci(args)` wie ociAufrufer; Fehler einzelner Abfragen landen in bestand.fehler.
export async function erheben(oci, { tenancy, jetzt = new Date() }) {
  const b = { tenancy, zeit: jetzt.toISOString(), fehler: [] };
  const hol = async (was, args, ersatz) => {
    const r = await oci(args);
    if (!r.ok) { b.fehler.push(`${was}: ${r.fehler}`); return ersatz; }
    return r.data ?? ersatz;
  };
  const t = ["--compartment-id", tenancy];
  b.regionen = liste(await hol("Regionen", ["iam", "region-subscription", "list", "--tenancy-id", tenancy], []));
  b.abos = await hol("Abo", ["organizations", "subscription", "list", ...t, "--all"], null);
  b.e4Grenze = liste(await hol("Grenzen", ["limits", "value", "list", ...t, "--service-name", "compute",
    "--name", "standard-e4-core-count", "--all"], []));
  const unter = liste(await hol("Compartments", ["iam", "compartment", "list", ...t, "--compartment-id-in-subtree", "true",
    "--lifecycle-state", "ACTIVE", "--all"], []));
  b.compartments = [tenancy, ...unter.map((c) => c.id)];
  b.ads = liste(await hol("Verfügbarkeitsbereiche", ["iam", "availability-domain", "list", ...t], [])).map((a) => a.name);
  const ns = await hol("Objektspeicher", ["os", "ns", "get"], null);
  Object.assign(b, { instanzen: [], bootVolumes: [], bootAnhaenge: [], volumes: [], backups: [], bootBackups: [], buckets: [] });
  for (const c of b.compartments) {
    const k = ["--compartment-id", c, "--all"];
    b.instanzen.push(...liste(await hol("Instanzen", ["compute", "instance", "list", ...k], [])));
    b.volumes.push(...liste(await hol("Block-Volumes", ["bv", "volume", "list", ...k], [])));
    b.backups.push(...liste(await hol("Backups", ["bv", "backup", "list", ...k], [])));
    b.bootBackups.push(...liste(await hol("Boot-Backups", ["bv", "boot-volume-backup", "list", ...k], [])));
    for (const ad of b.ads) {
      const a = [...k, "--availability-domain", ad];
      b.bootVolumes.push(...liste(await hol("Boot-Volumes", ["bv", "boot-volume", "list", ...a], [])));
      b.bootAnhaenge.push(...liste(await hol("Boot-Anhänge", ["compute", "boot-volume-attachment", "list", ...a], [])));
    }
    if (ns) {
      for (const bk of liste(await hol("Buckets", ["os", "bucket", "list", ...k, "--namespace", ns], []))) {
        b.buckets.push(await hol("Bucket", ["os", "bucket", "get", "--namespace", ns, "--bucket-name", bk.name,
          "--fields", "approximateSize"], { name: bk.name }));
      }
    }
  }
  b.freierTopf = await hol("Freier Blockspeicher", ["limits", "resource-availability", "get", "--service-name", "block-storage",
    "--limit-name", "total-free-storage-gb-regional", ...t], null);
  b.quota = liste(await hol("Quota", ["limits", "quota", "list", ...t, "--name", "nur-kostenlos", "--all"], []));
  b.budgets = liste(await hol("Budget", ["budgets", "budget", "budget", "list", ...t, "--all"], []));
  const warnung = b.budgets.find((x) => x["display-name"] === "kostenwarnung");
  b.budgetRegeln = warnung ? liste(await hol("Budget-Regeln", ["budgets", "budget", "alert-rule", "list", "--budget-id", warnung.id, "--all"], [])) : [];
  b.markiert = liste(await hol("Kennzeichen", ["search", "resource", "structured-search", "--query-text",
    `query all resources where (freeformTags.key = '${KENNZEICHEN}')`], []));
  const m = monat(jetzt);
  b.kosten = liste(await hol("Kosten", ["usage-api", "usage-summary", "request-summarized-usages", "--tenant-id", tenancy,
    "--time-usage-started", m.start, "--time-usage-ended", m.ende, "--granularity", "MONTHLY", "--query-type", "COST",
    "--group-by", '["service","skuName"]'], []));
  return b;
}

// Kontotyp: Abo-Daten zuerst (payment-model), sonst die Grenze bezahlter Formen (Free Tier: 0).
export function kontotyp(b) {
  const modelle = liste(b.abos).map((a) => String(a["payment-model"] || "").toUpperCase()).filter(Boolean);
  if (modelle.includes("PAYG")) return { typ: "payg", text: "Pay-As-You-Go" };
  if (modelle.some((x) => x.includes("TRIAL"))) return { typ: "test", text: "Testzeitraum" };
  if (modelle.some((x) => x.includes("FREE"))) return { typ: "free", text: "Free Tier" };
  const grenzen = b.e4Grenze.map((g) => zahl(g.value));
  if (grenzen.length && grenzen.every((v) => v === 0)) return { typ: "free", text: "Free Tier (keine bezahlten Formen)" };
  if (grenzen.some((v) => v > 0)) return { typ: "test-oder-payg", text: "Testzeitraum oder Pay-As-You-Go (unklar)" };
  return { typ: "unbekannt", text: "unbekannt" };
}

// Wertet den Bestand aus: Belegung, Rest, Befunde, Plan für einen neuen Server, Exit-Code der Kostenprüfung.
export function auswerten(b, { helfer = false } = {}) {
  const instanzen = b.instanzen.filter(lebt);
  const a1 = instanzen.filter((i) => i.shape === A1 && i["lifecycle-state"] !== "STOPPED");
  const ocpu = summe(a1, (i) => i["shape-config"] && i["shape-config"].ocpus);
  const gb = summe(a1, (i) => i["shape-config"] && i["shape-config"]["memory-in-gbs"]);
  const micro = instanzen.filter((i) => i.shape === MICRO).length;
  const fremdeFormen = instanzen.filter((i) => i.shape !== A1 && i.shape !== MICRO && i["lifecycle-state"] !== "STOPPED");
  const boot = b.bootVolumes.filter(lebt);
  const vols = b.volumes.filter(lebt);
  const angehaengt = new Set(b.bootAnhaenge.filter((a) => a["lifecycle-state"] === "ATTACHED").map((a) => a["boot-volume-id"]));
  const lose = boot.filter((v) => !angehaengt.has(v.id));
  const speicherGb = summe(boot, (v) => v["size-in-gbs"]) + summe(vols, (v) => v["size-in-gbs"]);
  const topf = b.freierTopf && Number.isFinite(Number(b.freierTopf.used))
    ? { belegt: zahl(b.freierTopf.used), rest: zahl(b.freierTopf.available), quelle: "Oracle" }
    : { belegt: speicherGb, rest: Math.max(0, FREI.speicherGb - speicherGb), quelle: "gerechnet" };
  const backups = [...b.backups, ...b.bootBackups].filter((x) => x["lifecycle-state"] === "AVAILABLE").length;
  const objektGb = summe(b.buckets, (x) => zahl(x["approximate-size"]) / 1e9);
  const kosten = b.kosten.filter((k) => zahl(k["computed-amount"]) > 0)
    .map((k) => ({ dienst: k.service || "", sku: k["sku-name"] || "", betrag: zahl(k["computed-amount"]), waehrung: k.currency || "" }));
  const heimat = (b.regionen.find((r) => r["is-home-region"]) || {})["region-name"] || "";
  const name = (x) => x["display-name"] || x.name || "ohne Namen";
  const euro = (n) => n.toFixed(2).replace(".", ",");

  const befunde = [];
  const fund = (art, text) => befunde.push({ art, text });
  for (const k of kosten) fund("kosten", `${k.dienst} – ${k.sku}: ${euro(k.betrag)} ${k.waehrung} in diesem Monat.`);
  if (ocpu > FREI.a1Ocpu || gb > FREI.a1Gb) {
    fund("grenze", `A1 läuft mit ${ocpu} OCPU / ${gb} GB, frei sind ${FREI.a1Ocpu} / ${FREI.a1Gb}. Den Rest darf Oracle berechnen.`);
  }
  if (micro > FREI.micro) fund("grenze", `${micro} Micro-Instanzen, frei sind ${FREI.micro}.`);
  for (const i of fremdeFormen) fund("grenze", `Instanz „${name(i)}“ nutzt ${i.shape}; diese Form ist nicht kostenlos.`);
  if (topf.rest < 0 || topf.belegt > FREI.speicherGb) fund("grenze", `Blockspeicher ${topf.belegt} GB, frei sind ${FREI.speicherGb} GB.`);
  for (const v of [...boot, ...vols]) {
    if (zahl(v["vpus-per-gb"]) > FREI.vpu || v["is-auto-tune-enabled"]) {
      fund("grenze", `Volume „${name(v)}“ hat höhere Leistung (${zahl(v["vpus-per-gb"])} VPU); kostenlos ist „Balanced“ (10 VPU).`);
    }
  }
  if (backups > FREI.backups) fund("grenze", `${backups} Backups, frei sind ${FREI.backups}.`);
  if (objektGb > FREI.objektGb) fund("grenze", `Objektspeicher ${objektGb.toFixed(1).replace(".", ",")} GB, frei sind ${FREI.objektGb} GB.`);
  for (const v of lose) {
    fund("hinweis", `Boot-Volume „${name(v)}“ (${zahl(v["size-in-gbs"])} GB) hängt an keiner Instanz und belegt freien Speicher.`);
  }
  const quota = b.quota.find((q) => q.name === "nur-kostenlos" && q["lifecycle-state"] === "ACTIVE");
  const budget = b.budgets.find((x) => x["display-name"] === "kostenwarnung");
  // Ein Budget schützt nur mit Mail-Regel für echte Kosten (ACTUAL); ohne Regel kommt nie eine Mail
  const budgetMail = !!budget && (b.budgetRegeln || []).some((r) => r.type === "ACTUAL" && lebt(r));
  if (!quota) fund("hinweis", "Schutz fehlt: Quota-Richtlinie „nur-kostenlos“.");
  if (!budget) fund("hinweis", "Schutz fehlt: Budget „kostenwarnung“ mit Mail ab dem ersten Cent.");
  else if (!budgetMail) fund("hinweis", "Schutz unvollständig: Budget „kostenwarnung“ ohne Mail ab dem ersten Cent.");
  for (const f of b.fehler) fund("hinweis", `Nicht geprüft: ${f}`);

  // Neuer Server: nur, was ganz in die Reste passt; Boot-Volume = Rest des freien Topfs. Ein Volume, das nicht ganz in den
  // freien Topf passt, berechnet Oracle vollständig, nicht nur den Überhang.
  // Kennzeichen-Wert „helfer“ = Platzsucher, alles andere bzw. ohne Wert = der Server selbst.
  const istServer = (x) => ((x["freeform-tags"] || {})[KENNZEICHEN] || "server") !== "helfer";
  const server = b.markiert.find((r) => r["resource-type"] === "Instance" && lebt(r) && istServer(r)) ||
    instanzen.find((i) => unsere(i) && istServer(i));
  const rest = { ocpu: Math.max(0, FREI.a1Ocpu - ocpu), gb: Math.max(0, FREI.a1Gb - gb), micro: Math.max(0, FREI.micro - micro) };
  const bootGb = Math.min(FREI.speicherGb, topf.rest) - (helfer ? ZIEL.helferBootGb : 0);
  const gruende = [];
  if (rest.ocpu < ZIEL.ocpu || rest.gb < ZIEL.gb) gruende.push(`freie A1-Menge reicht nicht (frei: ${rest.ocpu} OCPU / ${rest.gb} GB)`);
  if (bootGb < ZIEL.bootMinGb) gruende.push(`freier Blockspeicher reicht nicht (frei: ${Math.max(0, bootGb)} GB, nötig ${ZIEL.bootMinGb} GB)`);
  if (helfer && rest.micro < 1) gruende.push("kein Micro-Platz für den Platzsucher frei");
  const plan = server
    ? { status: "da", text: `Server „${name(server)}“ ist schon angelegt.` }
    : gruende.length
      ? { status: "passt-nicht", text: `Neuer Server passt nicht: ${gruende.join("; ")}.` }
      : { status: "passt", ocpu: ZIEL.ocpu, gb: ZIEL.gb, bootGb,
        text: `Neuer Server passt: A1 ${ZIEL.ocpu} OCPU / ${ZIEL.gb} GB, Boot-Volume ${bootGb} GB${helfer ? " (später auf " + Math.min(FREI.speicherGb, topf.rest) + " GB)" : ""}.` };

  const exit = befunde.some((x) => x.art === "kosten" || x.art === "grenze") ? 1 : b.fehler.length ? 2 : 0;
  return {
    zeit: b.zeit, konto: kontotyp(b), heimat, exit, befunde, plan,
    belegt: { ocpu, gb, micro, speicherGb: topf.belegt, backups, objektGb: Math.round(objektGb * 10) / 10 },
    rest: { ...rest, speicherGb: topf.rest, speicherQuelle: topf.quelle },
    kosten, schutz: { quota: !!quota, budget: budgetMail },
    studiumAutopilot: b.markiert.filter(lebt).map((r) => ({ typ: r["resource-type"], name: r["display-name"] || "" })),
  };
}

// Kurze Übersicht für den Chat bzw. die Cloud Shell.
export function text(a) {
  const z = [];
  z.push(`Oracle-Konto, Stand ${a.zeit.slice(0, 16).replace("T", " ")} UTC`);
  z.push(`Kontotyp: ${a.konto.text} · Heimatregion: ${a.heimat || "unbekannt"}`);
  z.push("Freie Mengen (belegt / frei):");
  z.push(`  A1-Server     ${a.belegt.ocpu} / ${FREI.a1Ocpu} OCPU, ${a.belegt.gb} / ${FREI.a1Gb} GB`);
  z.push(`  Micro-Server  ${a.belegt.micro} / ${FREI.micro}`);
  z.push(`  Blockspeicher ${a.belegt.speicherGb} / ${FREI.speicherGb} GB (Rest ${a.rest.speicherGb} GB)`);
  z.push(`  Backups       ${a.belegt.backups} / ${FREI.backups}`);
  const summeKosten = a.kosten.reduce((s, k) => s + k.betrag, 0);
  z.push(`Kosten diesen Monat: ${summeKosten ? summeKosten.toFixed(2).replace(".", ",") + " " + (a.kosten[0].waehrung || "") : "0"}`);
  z.push(`Schutz: Quota „nur-kostenlos“ ${a.schutz.quota ? "ja" : "fehlt"} · Budget „kostenwarnung“ ${a.schutz.budget ? "ja" : "fehlt"}`);
  z.push(`Studium Autopilot: ${a.studiumAutopilot.length ? a.studiumAutopilot.map((r) => `${r.typ} „${r.name}“`).join(", ") : "noch nichts angelegt"}`);
  z.push(a.plan.text);
  if (a.befunde.length) {
    z.push("Befunde:");
    for (const f of a.befunde) z.push(`  [${f.art}] ${f.text}`);
  }
  z.push(a.exit === 0 ? "Ergebnis: alles kostenlos." : a.exit === 1 ? "Ergebnis: Kosten oder überschrittene Grenze, siehe Befunde."
    : "Ergebnis: Prüfung unvollständig, siehe Befunde.");
  return z.join("\n");
}

// Konto: --tenancy, sonst $OCI_TENANCY (Cloud Shell), sonst tenancy= im Profil DEFAULT von ~/.oci/config.
export function tenancyFinden(argTenancy, env = process.env, configText = null) {
  if (argTenancy) return argTenancy;
  if (env.OCI_TENANCY) return env.OCI_TENANCY;
  let roh = configText;
  if (roh === null) {
    try { roh = readFileSync(join(homedir(), ".oci", "config"), "utf8"); } catch (e) { roh = ""; }
  }
  const m = /^\s*tenancy\s*=\s*(\S+)/m.exec(roh);
  return m ? m[1] : "";
}

async function main(argv) {
  const wert = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const tenancy = tenancyFinden(wert("--tenancy"));
  if (!tenancy) {
    console.error("Kein Konto gefunden: in der Oracle Cloud Shell starten oder --tenancy <ocid> angeben.");
    return 2;
  }
  const bestand = await erheben(ociAufrufer(wert("--oci") || "oci"), { tenancy });
  const a = auswerten(bestand, { helfer: argv.includes("--helfer") });
  console.log(argv.includes("--json") ? JSON.stringify(a, null, 2) : text(a));
  return argv.includes("--kosten") ? a.exit : 0;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
